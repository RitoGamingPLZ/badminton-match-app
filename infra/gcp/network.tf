resource "google_compute_network" "vpc" {
  name                    = "badminton-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "badminton-subnet"
  ip_cidr_range = "10.0.1.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
}

# Allow GCP load balancer health check probes to reach backend VMs
resource "google_compute_firewall" "allow_health_check" {
  name    = "badminton-allow-health-check"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["3001"]
  }

  # GCP LB health check source ranges
  source_ranges = ["130.211.0.0/22", "35.191.0.0/16"]
  target_tags   = ["badminton-backend"]
}

# Allow SSH via Identity-Aware Proxy (no public SSH needed)
resource "google_compute_firewall" "allow_iap_ssh" {
  name    = "badminton-allow-iap-ssh"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["badminton-backend"]
}

# Cloud Router + NAT — gives private VMs outbound internet access
# (needed to pull Docker images from GCR / Docker Hub)
resource "google_compute_router" "router" {
  name    = "badminton-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

resource "google_compute_router_nat" "nat" {
  name                               = "badminton-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}
