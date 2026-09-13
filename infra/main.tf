terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  region  = var.region
  profile = var.profile
}

variable "region"  { default = "ap-southeast-1" }
variable "profile" { default = "lavni" }
variable "name"    { default = "taw-qa" }

# BE staging ở VN; region này cho ~40ms thay vì ~250ms từ us-east-1.
variable "instance_type" { default = "m7i-flex.xlarge" }

# `next build` xin heap 4GB, .next 2.8G + node_modules 1.0G mỗi checkout.
variable "volume_size_gb" { default = 50 }

variable "ssh_key_name" {
  description = "Keypair có sẵn. SSH thường vào không được — dùng SSM Session Manager."
  default     = "andie"
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# AMI GHIM CỨNG, cố ý. Để `most_recent = true` thì mỗi lần Canonical ra ảnh mới,
# `tofu apply` sẽ THAY instance — xoá sạch mọi thứ đã provision (node, chromium,
# systemd unit) mà không ai yêu cầu. Đã xảy ra hai lần trong lúc dựng.
# Nâng AMI là việc có chủ đích: đổi id ở đây rồi apply.
variable "ami_id" {
  description = "ubuntu-noble-24.04-amd64-server-20260904, ap-southeast-1"
  default     = "ami-0ba4172b23e57d5a8"
}

# Tạo ngoài Terraform (private key GitHub App). Chỉ tham chiếu, không quản lý.
data "aws_secretsmanager_secret" "github_app" {
  name = "taw-qa/github-app"
}

# Config per-project: BE_URL, tài khoản test, org scope, env FE.
data "aws_secretsmanager_secret" "project" {
  name = "taw-qa/project/sutagrow-web"
}

# opencode Zen: model viết spec từ Claim.
data "aws_secretsmanager_secret" "opencode" {
  name = "taw-qa/opencode"
}
