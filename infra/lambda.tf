# ── IAM role for Lambda ───────────────────────────────────────────────────────

resource "aws_iam_role" "lambda" {
  name = "badminton-api-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "badminton-api-dynamodb"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = aws_dynamodb_table.rooms.arn
      }
    ]
  })
}

# ── Lambda function ───────────────────────────────────────────────────────────

resource "aws_lambda_function" "api" {
  function_name = "badminton-api"
  description   = "Handles all REST routes and SSE streaming"

  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)

  role    = aws_iam_role.lambda.arn
  handler = "handler.handler"
  runtime = "nodejs20.x"

  architectures = ["arm64"] # Graviton2 — cheaper + faster for Node.js
  timeout       = 900        # 15 min max — needed for long SSE connections
  memory_size   = 256

  environment {
    variables = {
      TABLE_NAME     = aws_dynamodb_table.rooms.name
      ALLOWED_ORIGIN = var.allowed_origin
    }
  }

  tracing_config {
    mode = "Active"
  }
}

# ── Lambda Function URL (replaces API Gateway) ────────────────────────────────
# InvokeMode RESPONSE_STREAM is required for SSE connections

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
  invoke_mode        = "RESPONSE_STREAM"

  cors {
    allow_origins = [var.allowed_origin]
    allow_headers = ["Content-Type", "X-Host-Token"]
    allow_methods = ["GET", "POST", "PATCH", "OPTIONS"]
  }
}
