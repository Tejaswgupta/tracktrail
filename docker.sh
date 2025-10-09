#!/bin/bash

# TrackTrail Docker Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    cat << EOF
TrackTrail Docker Management Script

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    build       Build the Docker image
    run         Run the container
    stop        Stop the container
    restart     Restart the container
    logs        Show container logs
    shell       Open shell in running container
    clean       Clean up containers and images
    dev         Run in development mode
    help        Show this help message

Options:
    --force     Force rebuild/restart
    --detach    Run in detached mode
    --follow    Follow logs

Examples:
    $0 build --force
    $0 run --detach
    $0 logs --follow
    $0 dev

EOF
}

# Configuration
IMAGE_NAME="tracktrail"
CONTAINER_NAME="tracktrail-app"
COMPOSE_FILE="docker-compose.yml"

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi
}

# Build the Docker image
build_image() {
    local force_build=false
    
    for arg in "$@"; do
        case $arg in
            --force)
                force_build=true
                shift
                ;;
        esac
    done
    
    print_status "Building TrackTrail Docker image..."
    
    if [ "$force_build" = true ]; then
        print_status "Force rebuilding image (no cache)..."
        docker build --no-cache -t $IMAGE_NAME .
    else
        docker build -t $IMAGE_NAME .
    fi
    
    print_success "Image built successfully!"
}

# Run the container
run_container() {
    local detach_mode=false
    
    for arg in "$@"; do
        case $arg in
            --detach)
                detach_mode=true
                shift
                ;;
        esac
    done
    
    # Stop existing container if running
    if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        print_warning "Stopping existing container..."
        docker stop $CONTAINER_NAME
        docker rm $CONTAINER_NAME
    fi
    
    print_status "Starting TrackTrail container..."
    
    if [ "$detach_mode" = true ]; then
        docker run -d \
            --name $CONTAINER_NAME \
            -p 3000:3000 \
            -p 8000:8000 \
            $IMAGE_NAME
        print_success "Container started in detached mode!"
        print_status "Frontend: http://localhost:3000"
        print_status "Backend API: http://localhost:8000"
        print_status "API Documentation: http://localhost:8000/docs"
    else
        docker run -it \
            --name $CONTAINER_NAME \
            -p 3000:3000 \
            -p 8000:8000 \
            $IMAGE_NAME
    fi
}

# Stop the container
stop_container() {
    if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        print_status "Stopping TrackTrail container..."
        docker stop $CONTAINER_NAME
        print_success "Container stopped!"
    else
        print_warning "No running container found."
    fi
}

# Restart the container
restart_container() {
    local force_restart=false
    
    for arg in "$@"; do
        case $arg in
            --force)
                force_restart=true
                shift
                ;;
        esac
    done
    
    if [ "$force_restart" = true ]; then
        build_image --force
    fi
    
    stop_container
    run_container --detach
}

# Show logs
show_logs() {
    local follow_logs=false
    
    for arg in "$@"; do
        case $arg in
            --follow)
                follow_logs=true
                shift
                ;;
        esac
    done
    
    if ! docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        print_error "Container is not running."
        exit 1
    fi
    
    if [ "$follow_logs" = true ]; then
        docker logs -f $CONTAINER_NAME
    else
        docker logs $CONTAINER_NAME
    fi
}

# Open shell in container
open_shell() {
    if ! docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        print_error "Container is not running."
        exit 1
    fi
    
    print_status "Opening shell in TrackTrail container..."
    docker exec -it $CONTAINER_NAME /bin/sh
}

# Clean up
clean_up() {
    print_status "Cleaning up Docker resources..."
    
    # Stop and remove container
    if docker ps -a -q -f name=$CONTAINER_NAME | grep -q .; then
        docker stop $CONTAINER_NAME 2>/dev/null || true
        docker rm $CONTAINER_NAME 2>/dev/null || true
    fi
    
    # Remove image
    if docker images -q $IMAGE_NAME | grep -q .; then
        docker rmi $IMAGE_NAME 2>/dev/null || true
    fi
    
    # Clean up dangling images and containers
    docker system prune -f
    
    print_success "Cleanup completed!"
}

# Development mode using docker-compose
run_dev() {
    print_status "Starting TrackTrail in development mode..."
    docker-compose --profile dev up --build
}

# Main script logic
main() {
    check_docker
    
    case "${1:-help}" in
        build)
            shift
            build_image "$@"
            ;;
        run)
            shift
            run_container "$@"
            ;;
        stop)
            stop_container
            ;;
        restart)
            shift
            restart_container "$@"
            ;;
        logs)
            shift
            show_logs "$@"
            ;;
        shell)
            open_shell
            ;;
        clean)
            clean_up
            ;;
        dev)
            run_dev
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"