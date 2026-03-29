terraform {
  required_version = ">= 1.7"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Remote state — create a GCS bucket manually once, then uncomment:
  #
  # backend "gcs" {
  #   bucket = "badminton-app-tfstate"
  #   prefix = "badminton-match-app"
  # }
}

provider "google" {
  project = var.gcp_project
  region  = var.gcp_region
}
