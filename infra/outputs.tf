output "api_url" {
  description = "Lambda Function URL — use as VITE_API_BASE in the frontend"
  value       = aws_lambda_function_url.api.function_url
}

output "frontend_bucket" {
  description = "S3 bucket name for the frontend"
  value       = aws_s3_bucket.frontend.bucket
}

output "frontend_url" {
  description = "Frontend website URL"
  value       = "https://${aws_s3_bucket.frontend.bucket}.s3-website-${var.aws_region}.amazonaws.com"
}

output "dynamodb_table" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.rooms.name
}
