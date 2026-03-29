variable "gcp_project" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCS bucket location (multi-region: US, EU, ASIA; or single-region: us-central1, etc.)"
  type        = string
  default     = "US"
}

variable "bucket_name" {
  description = "GCS bucket name for frontend hosting — must be globally unique across all of GCS"
  type        = string
  default     = "badminton-match-app-frontend"
}
