variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "allowed_origin" {
  description = "CORS allowed origin for the backend API"
  type        = string
  default     = "*"
}

variable "firestore_location" {
  description = "Firestore database location (multi-region: nam5/eur3, or single region)"
  type        = string
  default     = "nam5"
}

variable "backend_image" {
  description = "Docker image for the backend (e.g. gcr.io/PROJECT/badminton-backend:latest)"
  type        = string
}

variable "bucket_name" {
  description = "GCS bucket name for frontend hosting — must be globally unique across all of GCS"
  type        = string
  default     = "badminton-match-app-frontend"
}
