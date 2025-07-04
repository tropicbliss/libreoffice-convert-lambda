# LibreOffice Convert Lambda Deployment Makefile

# Configuration
REGION := ap-southeast-1
NAME := libreoffice-convert-lambda
ACCOUNT_ID := $(shell aws sts get-caller-identity --query Account --output text)

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

.PHONY: help validate deploy debug clear-failed clean status all

# Default target
all: validate deploy

help: ## Show this help message
	@echo "LibreOffice Convert Lambda Deployment"
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(YELLOW)%-15s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

validate: ## Validate CloudFormation template
	@echo "$(GREEN)Validating CloudFormation template...$(NC)"
	aws cloudformation validate-template \
		--template-body file://../cloudformation.yaml \
		--region $(REGION)
	@echo "$(GREEN)✓ Template validation successful$(NC)"

deploy: validate ## Build and deploy the Lambda function
	@echo "$(GREEN)Starting deployment...$(NC)"
	@echo "$(YELLOW)Building Docker image...$(NC)"
	docker buildx build --platform linux/amd64 --provenance=false -t $(NAME) .
	
	@echo "$(YELLOW)Tagging image...$(NC)"
	docker tag $(NAME):latest $(ACCOUNT_ID).dkr.ecr.$(REGION).amazonaws.com/$(NAME):latest
	
	@echo "$(YELLOW)Logging into ECR...$(NC)"
	aws ecr get-login-password --region $(REGION) | \
		docker login --username AWS --password-stdin $(ACCOUNT_ID).dkr.ecr.$(REGION).amazonaws.com
	
	@echo "$(YELLOW)Pushing image to ECR...$(NC)"
	docker push $(ACCOUNT_ID).dkr.ecr.$(REGION).amazonaws.com/$(NAME):latest
	
	@echo "$(YELLOW)Getting image digest...$(NC)"
	$(eval DIGEST := $(shell aws ecr describe-images --repository-name $(NAME) --image-ids imageTag=latest --query 'imageDetails[0].imageDigest' --output text --region $(REGION)))
	$(eval IMAGE_URI := $(ACCOUNT_ID).dkr.ecr.$(REGION).amazonaws.com/$(NAME)@$(DIGEST))
	
	@echo "$(YELLOW)Deploying CloudFormation stack...$(NC)"
	aws cloudformation deploy \
		--template-file ../cloudformation.yaml \
		--stack-name $(NAME) \
		--parameter-overrides Stage=development ImageUri=$(IMAGE_URI) \
		--capabilities CAPABILITY_NAMED_IAM \
		--region $(REGION)
	
	@echo "$(GREEN)✓ Deployment completed successfully$(NC)"
	@echo "$(GREEN)Stack outputs:$(NC)"
	aws cloudformation describe-stacks \
		--stack-name $(NAME) \
		--query 'Stacks[0].Outputs' \
		--region $(REGION)

debug: ## Show CloudFormation stack events for debugging
	@echo "$(GREEN)Fetching stack events...$(NC)"
	aws cloudformation describe-stack-events \
		--stack-name $(NAME) \
		--region $(REGION)

clear-failed: ## Delete failed CloudFormation stack
	@echo "$(RED)Deleting failed stack...$(NC)"
	@echo "$(YELLOW)Warning: This will delete the entire stack!$(NC)"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ] || exit 1
	aws cloudformation delete-stack \
		--stack-name $(NAME) \
		--region $(REGION)
	@echo "$(YELLOW)Waiting for stack deletion to complete...$(NC)"
	aws cloudformation wait stack-delete-complete \
		--stack-name $(NAME) \
		--region $(REGION)
	@echo "$(GREEN)✓ Stack deleted successfully$(NC)"

status: ## Show current stack status
	@echo "$(GREEN)Current stack status:$(NC)"
	aws cloudformation describe-stacks \
		--stack-name $(NAME) \
		--query 'Stacks[0].{Status:StackStatus,Created:CreationTime,Updated:LastUpdatedTime}' \
		--region $(REGION) \
		--output table 2>/dev/null || echo "$(RED)Stack not found$(NC)"

clean: ## Clean up local Docker images
	@echo "$(GREEN)Cleaning up local Docker images...$(NC)"
	docker rmi $(NAME):latest || true
	docker rmi $(ACCOUNT_ID).dkr.ecr.$(REGION).amazonaws.com/$(NAME):latest || true
	@echo "$(GREEN)✓ Cleanup completed$(NC)"

# Development targets
dev-deploy: ## Quick deploy without validation (for development)
	@echo "$(YELLOW)Quick deployment (skipping validation)...$(NC)"
	@$(MAKE) deploy --no-print-directory

force-deploy: clear-failed deploy ## Force deploy by clearing failed stack first

# Information targets
info: ## Show deployment configuration
	@echo "$(GREEN)Deployment Configuration:$(NC)"
	@echo "  Region: $(REGION)"
	@echo "  Stack Name: $(NAME)"
	@echo "  Account ID: $(ACCOUNT_ID)"
	@echo "  Image URI: $(ACCOUNT_ID).dkr.ecr.$(REGION).amazonaws.com/$(NAME):latest"