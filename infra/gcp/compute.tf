# Service account attached to every backend VM
resource "google_service_account" "backend_sa" {
  account_id   = "badminton-backend-sa"
  display_name = "Badminton Backend Service Account"
  depends_on   = [google_project_service.apis]
}

# Allow the VM service account to read/write Firestore
resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.backend_sa.email}"
}

# Allow pulling images from Artifact Registry / GCR
resource "google_project_iam_member" "ar_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.backend_sa.email}"
}

locals {
  startup_script = <<-SCRIPT
    #!/bin/bash
    set -e
    apt-get update -y
    apt-get install -y docker.io
    systemctl enable --now docker

    # Authenticate Docker to GCR using the instance's service account
    gcloud auth configure-docker --quiet

    docker run -d \
      --name badminton-backend \
      --restart unless-stopped \
      -p 3001:3001 \
      -e DB_DRIVER=firestore \
      -e GCP_PROJECT_ID=${var.project_id} \
      -e ALLOWED_ORIGIN=${var.allowed_origin} \
      ${var.backend_image}
  SCRIPT
}

resource "google_compute_instance_template" "backend" {
  name_prefix  = "badminton-backend-"
  machine_type = var.machine_type
  region       = var.region
  tags         = ["badminton-backend"]

  disk {
    source_image = "debian-cloud/debian-12"
    auto_delete  = true
    boot         = true
    disk_size_gb = 20
  }

  network_interface {
    network    = google_compute_network.vpc.id
    subnetwork = google_compute_subnetwork.subnet.id
    # No access_config block = no ephemeral public IP; outbound via Cloud NAT
  }

  service_account {
    email  = google_service_account.backend_sa.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    startup-script = local.startup_script
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    google_project_service.apis,
    google_project_iam_member.firestore_user,
    google_project_iam_member.ar_reader,
  ]
}

# Health check used by both the LB backend service and MIG auto-healing
resource "google_compute_health_check" "backend" {
  name                = "badminton-backend-health"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3

  http_health_check {
    port         = 3001
    request_path = "/health"
  }

  depends_on = [google_project_service.apis]
}

# Regional Managed Instance Group (autoscaling)
resource "google_compute_region_instance_group_manager" "backend_mig" {
  name               = "badminton-backend-mig"
  region             = var.region
  base_instance_name = "badminton-backend"

  version {
    instance_template = google_compute_instance_template.backend.id
  }

  named_port {
    name = "http"
    port = 3001
  }

  auto_healing_policies {
    health_check      = google_compute_health_check.backend.id
    initial_delay_sec = 120
  }
}

resource "google_compute_region_autoscaler" "backend" {
  name   = "badminton-backend-autoscaler"
  region = var.region
  target = google_compute_region_instance_group_manager.backend_mig.id

  autoscaling_policy {
    min_replicas    = var.min_replicas
    max_replicas    = var.max_replicas
    cooldown_period = 60

    cpu_utilization {
      target = 0.6
    }
  }
}
