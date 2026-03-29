terraform {
  required_version = ">= 1.7"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Uncomment to enable remote state in GCS
  # backend "gcs" {
  #   bucket = "badminton-terraform-state"
  #   prefix = "terraform/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required GCP APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "firestore.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "run.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}
