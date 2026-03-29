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
  description = "Service account email used by backend VMs"
  value       = google_service_account.backend_sa.email
}

output "mig_name" {
  description = "Name of the regional Managed Instance Group"
  value       = google_compute_region_instance_group_manager.backend_mig.name
}
