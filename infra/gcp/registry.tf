resource "google_artifact_registry_repository" "backend" {
  repository_id = "badminton-backend"
  format        = "DOCKER"
  location      = var.region
  description   = "Docker images for the badminton backend"
  depends_on    = [google_project_service.apis]
}
