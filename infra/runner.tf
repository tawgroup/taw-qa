# Runner không có inbound nào. Proxy, FE, Chromium đều nghe 127.0.0.1.
# Vào máy bằng SSM Session Manager, không mở port 22.
resource "aws_security_group" "runner" {
  name        = "${var.name}-runner"
  description = "taw-qa Runner: egress only, no inbound"
  vpc_id      = data.aws_vpc.default.id

  egress {
    description = "Outbound: GitHub, BE staging, npm, SSM"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.name}-runner" }
}

resource "aws_iam_role" "runner" {
  name = "${var.name}-runner"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Thay SSH: mở shell qua SSM, không cần port 22 hay public key.
resource "aws_iam_role_policy_attachment" "runner_ssm" {
  role       = aws_iam_role.runner.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "runner" {
  name = "${var.name}-runner"
  role = aws_iam_role.runner.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Runner cần CẢ HAI: creds GitHub App và config project. Thiếu cái thứ
        # hai thì nó đọc được PR nhưng chết ở AccessDeniedException lúc lấy
        # BE_URL — đúng lỗi của lần chạy đầu tiên.
        Sid    = "ReadSecrets"
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = [
          data.aws_secretsmanager_secret.github_app.arn,
          data.aws_secretsmanager_secret.project.arn,
          data.aws_secretsmanager_secret.opencode.arn,
        ]
      },
      {
        Sid    = "ShipRunLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
        Resource = "${aws_cloudwatch_log_group.runner.arn}:*"
      },
      {
        Sid    = "ClaimAndReleaseRunLock"
        Effect = "Allow"
        Action = ["ssm:GetParameter", "ssm:DeleteParameter"]
        Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.me.account_id}:parameter${local.lock_param}"
      },
      {
        Sid      = "SelfStop"
        Effect   = "Allow"
        Action   = "ec2:StopInstances"
        Resource = "arn:aws:ec2:${var.region}:${data.aws_caller_identity.me.account_id}:instance/*"
        Condition = {
          StringEquals = { "ec2:ResourceTag/Name" = "${var.name}-runner" }
        }
      },
    ]
  })
}

data "aws_caller_identity" "me" {}

resource "aws_iam_instance_profile" "runner" {
  name = "${var.name}-runner"
  role = aws_iam_role.runner.name
}

resource "aws_instance" "runner" {
  ami                    = var.ami_id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.runner.id]
  iam_instance_profile   = aws_iam_instance_profile.runner.name
  key_name               = var.ssh_key_name

  # Cần IP public để ra GitHub/npm; không có inbound nào nhờ security group.
  associate_public_ip_address = true

  root_block_device {
    volume_size = var.volume_size_gb
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_tokens   = "required" # IMDSv2
    http_endpoint = "enabled"
  }

  user_data                   = file("${path.module}/user-data.sh")
  # Doi user-data thi TAO LAI may: provisioning la mot buoc, sua nua voi tren
  # may cu de lai trang thai lai cang. Tao lai mat 5 phut, sach va biet chac.
  user_data_replace_on_change = true

  tags = { Name = "${var.name}-runner" }

  # instance_state do provider quyết, không khai trong config được. Lambda
  # start và Runner tự stop; tofu không đụng tới trạng thái chạy.
}

resource "aws_cloudwatch_log_group" "runner" {
  name              = "/taw-qa/runner"
  retention_in_days = 14
}
