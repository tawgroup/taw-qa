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

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

# Tạo ngoài Terraform (private key GitHub App). Chỉ tham chiếu, không quản lý.
data "aws_secretsmanager_secret" "github_app" {
  name = "taw-qa/github-app"
}
