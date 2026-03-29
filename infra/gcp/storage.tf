# ── Frontend GCS bucket ────────────────────────────────────────────────────────
#
# Serves the Vue 3 SPA as a static website.
# Vue Router history mode is supported via not_found_page → index.html fallback.
#
# Website URL (HTTP):  http://<bucket>.storage.googleapis.com/
# Direct HTTPS access: https://storage.googleapis.com/<bucket>/
#
# For a custom domain with HTTPS, front the bucket with a Cloud Load Balancer
# and Cloud CDN (see: cloud.google.com/storage/docs/hosting-static-website).

resource "google_storage_bucket" "frontend" {
  name          = var.bucket_name
  location      = var.region
  force_destroy = true

  # SPA routing — all unknown paths fall back to index.html
  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"
  }

  cors {
    origin          = ["*"]
    method          = ["GET"]
    response_header = ["Content-Type", "Content-Length", "ETag"]
    max_age_seconds = 3600
  }

  # Uniform bucket-level access — object ACLs disabled, IAM only
  uniform_bucket_level_access = true
}

# Make all objects publicly readable
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.frontend.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}
