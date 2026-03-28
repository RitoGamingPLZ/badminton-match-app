variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-southeast-1"
}

variable "allowed_origin" {
  description = "CORS allowed origin — set to your frontend URL in production (e.g. https://your-app.com)"
  type        = string
  default     = "*"
}

variable "lambda_zip_path" {
  description = "Path to the built Lambda zip file (relative to infra/). Built by CI before terraform apply."
  type        = string
  default     = "../backend/dist/lambda.zip"
}
