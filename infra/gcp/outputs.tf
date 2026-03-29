output "frontend_bucket" {
  description = "GCS bucket name"
  value       = google_storage_bucket.frontend.name
}

output "frontend_url" {
  description = "Frontend website URL (HTTP via GCS website endpoint)"
  value       = "http://${google_storage_bucket.frontend.name}.storage.googleapis.com/"
}

output "frontend_https_url" {
  description = "Frontend URL via HTTPS (direct object access — works but no SPA fallback routing)"
  value       = "https://storage.googleapis.com/${google_storage_bucket.frontend.name}/"
}

output "load_balancer_ipv4" {
  description = "IPv4 address of the load balancer — use for Cloudflare A record"
  value       = google_compute_global_address.ipv4.address
}

output "load_balancer_ipv6" {
  description = "IPv6 address of the load balancer — point Cloudflare AAAA record here"
  value       = google_compute_global_address.ipv6.address
}

output "firestore_database" {
  description = "Firestore database name"
  value       = google_firestore_database.default.name
}

output "backend_service_account" {
  description = "Service account email used by the Cloud Run backend"
  value       = google_service_account.backend_sa.email
}

output "cloud_run_url" {
  description = "Managed HTTPS URL of the Cloud Run backend service"
  value       = google_cloud_run_v2_service.backend.uri
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL for backend Docker images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.backend.repository_id}"
}
