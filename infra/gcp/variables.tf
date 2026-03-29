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

variable "machine_type" {
  description = "Compute Engine machine type for backend VMs"
  type        = string
  default     = "e2-micro"
}

variable "min_replicas" {
  description = "Minimum number of VM instances in the autoscaling group"
  type        = number
  default     = 1
}

variable "max_replicas" {
  description = "Maximum number of VM instances in the autoscaling group"
  type        = number
  default     = 5
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
