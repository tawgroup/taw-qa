locals {
  # Lambda ghi param này với Overwrite=false. Hai `/taw-qa` cùng lúc: người đầu
  # ghi được, người sau nhận ParameterAlreadyExists → comment "đang chạy".
  # Runner đọc lúc boot, xoá lúc teardown. Đây là ổ khoá của cả hệ thống.
  lock_param = "/${var.name}/current-run"
}

resource "aws_iam_role" "webhook" {
  name = "${var.name}-webhook"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "webhook" {
  name = "${var.name}-webhook"
  role = aws_iam_role.webhook.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.region}:${data.aws_caller_identity.me.account_id}:*"
      },
      {
        Sid      = "ReadGitHubAppSecret"
        Effect   = "Allow"
        Action   = "secretsmanager:GetSecretValue"
        Resource = data.aws_secretsmanager_secret.github_app.arn
      },
      {
        Sid      = "ClaimRunLock"
        Effect   = "Allow"
        Action   = ["ssm:PutParameter", "ssm:GetParameter"]
        Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.me.account_id}:parameter${local.lock_param}"
      },
      {
        Sid      = "StartRunnerOnly"
        Effect   = "Allow"
        Action   = ["ec2:StartInstances", "ec2:DescribeInstanceStatus"]
        Resource = aws_instance.runner.arn
      },
      {
        # DescribeInstances không nhận resource-level ARN; siết bằng tag.
        Sid      = "DescribeForBusyCheck"
        Effect   = "Allow"
        Action   = "ec2:DescribeInstances"
        Resource = "*"
      },
    ]
  })
}

data "archive_file" "webhook" {
  type        = "zip"
  source_file = "${path.module}/dist/handler.js"
  output_path = "${path.module}/dist/handler.zip"
}

resource "aws_lambda_function" "webhook" {
  function_name    = "${var.name}-webhook"
  role             = aws_iam_role.webhook.arn
  handler          = "handler.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.webhook.output_path
  source_code_hash = data.archive_file.webhook.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      SECRET_ID    = data.aws_secretsmanager_secret.github_app.name
      INSTANCE_ID  = aws_instance.runner.id
      LOCK_PARAM   = local.lock_param
      REPO_ALLOWED = "agribeacon/sutagrow-web"
    }
  }
}

resource "aws_cloudwatch_log_group" "webhook" {
  name              = "/aws/lambda/${var.name}-webhook"
  retention_in_days = 14
}

# HTTP API, không phải REST API: rẻ hơn và đủ cho một route.
resource "aws_apigatewayv2_api" "webhook" {
  name          = "${var.name}-webhook"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "webhook" {
  api_id                 = aws_apigatewayv2_api.webhook.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.webhook.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "webhook" {
  api_id    = aws_apigatewayv2_api.webhook.id
  route_key = "POST /webhook"
  target    = "integrations/${aws_apigatewayv2_integration.webhook.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.webhook.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.webhook.execution_arn}/*/*"
}

output "webhook_url" {
  description = "Dán vào ô Webhook URL của GitHub App taw-qa"
  value       = "${aws_apigatewayv2_stage.default.invoke_url}webhook"
}

output "runner_instance_id" {
  value = aws_instance.runner.id
}
