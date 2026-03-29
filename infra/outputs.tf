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
