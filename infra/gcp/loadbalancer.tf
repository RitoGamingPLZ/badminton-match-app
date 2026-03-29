# Static external IPv4 — point Cloudflare A record here
resource "google_compute_global_address" "ipv4" {
  name       = "badminton-lb-ipv4"
  ip_version = "IPV4"
}

# Static external IPv6 — point Cloudflare AAAA record here
resource "google_compute_global_address" "ipv6" {
  name       = "badminton-lb-ipv6"
  ip_version = "IPV6"
}

# Serverless NEG — bridges the Global LB to the Cloud Run service
resource "google_compute_region_network_endpoint_group" "backend_neg" {
  name                  = "badminton-backend-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.backend.name
  }
}

resource "google_compute_backend_service" "backend" {
  name                  = "badminton-backend-service"
  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL"
  # Match SSE connection lifetime
  timeout_sec = 900

  backend {
    group = google_compute_region_network_endpoint_group.backend_neg.id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

resource "google_compute_url_map" "lb" {
  name            = "badminton-lb"
  default_service = google_compute_backend_service.backend.id
}

resource "google_compute_target_http_proxy" "lb" {
  name    = "badminton-http-proxy"
  url_map = google_compute_url_map.lb.id
}

# IPv4 forwarding rule (port 80) — Cloudflare terminates TLS,
# so the origin only needs plain HTTP
resource "google_compute_global_forwarding_rule" "ipv4" {
  name                  = "badminton-lb-ipv4"
  ip_address            = google_compute_global_address.ipv4.address
  ip_protocol           = "TCP"
  port_range            = "80"
  target                = google_compute_target_http_proxy.lb.id
  load_balancing_scheme = "EXTERNAL"
}

# IPv6 forwarding rule (port 80)
resource "google_compute_global_forwarding_rule" "ipv6" {
  name                  = "badminton-lb-ipv6"
  ip_address            = google_compute_global_address.ipv6.address
  ip_protocol           = "TCP"
  port_range            = "80"
  target                = google_compute_target_http_proxy.lb.id
  load_balancing_scheme = "EXTERNAL"
}
