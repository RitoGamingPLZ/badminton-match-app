terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state — create this S3 bucket + DynamoDB table once manually
  # (or via `terraform/bootstrap`), then uncomment:
  #
  # backend "s3" {
  #   bucket         = "badminton-app-tfstate"
  #   key            = "badminton-match-app/terraform.tfstate"
  #   region         = "ap-southeast-1"
  #   dynamodb_table = "badminton-app-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region
}
