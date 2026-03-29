# Service account attached to the Cloud Run backend
resource "google_service_account" "backend_sa" {
  account_id   = "badminton-backend-sa"
  display_name = "Badminton Backend Service Account"
  depends_on   = [google_project_service.apis]
}

# Allow the service account to read/write Firestore
resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.backend_sa.email}"
}

# Allow the service account to pull images from Artifact Registry
resource "google_project_iam_member" "ar_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.backend_sa.email}"
}

# Cloud Run backend service
resource "google_cloud_run_v2_service" "backend" {
  name     = "badminton-backend"
  location = var.region

  template {
    service_account = google_service_account.backend_sa.email

    containers {
      image = var.backend_image

      ports {
        container_port = 3001
      }

      env {
        name  = "DB_DRIVER"
        value = "firestore"
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "ALLOWED_ORIGIN"
        value = var.allowed_origin
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_project_iam_member.firestore_user,
    google_project_iam_member.ar_reader,
  ]
}

# Allow unauthenticated public invocations via the load balancer
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
