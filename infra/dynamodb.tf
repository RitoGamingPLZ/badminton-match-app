# ── DynamoDB rooms table ──────────────────────────────────────────────────────

resource "aws_dynamodb_table" "rooms" {
  name         = "BadmintonRooms"
  billing_mode = "PAY_PER_REQUEST" # On-demand; free tier covers hobby use

  hash_key = "code"

  attribute {
    name = "code"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true # Rooms auto-delete after 24 hours
  }
}
