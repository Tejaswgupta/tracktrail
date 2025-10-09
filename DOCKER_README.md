# TrackTrail Docker Setup

This document explains how to build and run the TrackTrail application using Docker, which includes both the frontend (Next.js) and backend (FastAPI) services.

## Quick Start

### Option 1: Using Docker Compose (Recommended)

```bash
# Build and run both services
docker-compose up --build

# Run in detached mode
docker-compose up -d --build

# Stop services
docker-compose down
```

### Option 2: Using the Management Script

```bash
# Make the script executable
chmod +x docker.sh

# Build the image
./docker.sh build

# Run the container
./docker.sh run --detach

# View logs
./docker.sh logs --follow

# Stop the container
./docker.sh stop
```

### Option 3: Manual Docker Commands

```bash
# Build the image
docker build -t tracktrail .

# Run the container
docker run -d \
  --name tracktrail-app \
  -p 3000:3000 \
  -p 8000:8000 \
  tracktrail
```

## Services

Once running, you can access:

- **Frontend (Next.js)**: http://localhost:3000
- **Backend API (FastAPI)**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Alternative API Docs**: http://localhost:8000/redoc

## Architecture

The Docker setup uses a multi-stage build process:

1. **Frontend Builder Stage**: Builds the Next.js application using Node.js 18 and pnpm
2. **Backend Base Stage**: Sets up Python 3.11 environment and installs backend dependencies
3. **Production Stage**: Combines both services using supervisor to manage processes

### Multi-Service Management

The container uses [Supervisor](http://supervisord.org/) to manage both the frontend and backend processes:

- **Backend**: FastAPI server running on port 8000
- **Frontend**: Next.js server running on port 3000

## Configuration

### Environment Variables

The application supports various environment variables for configuration:

#### Backend Configuration
```bash
# Application settings
APP_NAME=Financial Analysis API
APP_VERSION=1.0.0
DEBUG=false
LOG_LEVEL=INFO

# Database settings
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
DATABASE_TIMEOUT=30

# API settings
API_V1_PREFIX=/api/v1
CORS_ORIGINS=*
MAX_REQUEST_SIZE=10485760
MAX_ENTITIES_PER_REQUEST=50
MAX_DATE_RANGE_DAYS=365

# AI/LLM settings (optional)
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://model.thevotum.com/v1
```

#### Frontend Configuration
```bash
NODE_ENV=production
```

### Custom Environment File

Create a `.env` file in the root directory to override default values:

```bash
# .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_actual_key
OPENAI_API_KEY=your_openai_key
DEBUG=true
LOG_LEVEL=DEBUG
```

## Development

### Development Mode

For development with hot reloading, use the development profile:

```bash
# Start development services
docker-compose --profile dev up --build

# Or using the script
./docker.sh dev
```

This will:
- Mount source code volumes for hot reloading
- Enable debug mode
- Run services on different ports (8001 for backend, 3001 for frontend)

### Local Development Without Docker

#### Backend
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend
```bash
cd frontend
pnpm install
pnpm dev
```

## Monitoring and Logs

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker logs -f tracktrail-app

# Using the management script
./docker.sh logs --follow
```

### Health Checks

The container includes health checks that verify both services are running:

```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' tracktrail-app
```

### Supervisor Logs

Inside the container, supervisor logs are available at:
- `/var/log/supervisor/supervisord.log` - Main supervisor log
- `/var/log/supervisor/backend.out.log` - Backend stdout
- `/var/log/supervisor/backend.err.log` - Backend stderr
- `/var/log/supervisor/frontend.out.log` - Frontend stdout
- `/var/log/supervisor/frontend.err.log` - Frontend stderr

## Production Deployment

### Security Considerations

1. **Environment Variables**: Use proper environment variable management (Kubernetes secrets, Docker Swarm secrets, etc.)
2. **Network Security**: Configure proper firewall rules and network policies
3. **CORS Origins**: Set specific origins instead of `*` in production
4. **Trusted Hosts**: Configure the TrustedHostMiddleware with specific hosts
5. **SSL/TLS**: Use a reverse proxy (nginx, traefik) for SSL termination

### Example Production Docker Compose

```yaml
version: '3.8'

services:
  tracktrail:
    image: tracktrail:latest
    ports:
      - "3000:3000"
      - "8000:8000"
    environment:
      - NODE_ENV=production
      - DEBUG=false
      - CORS_ORIGINS=https://yourapp.com,https://api.yourapp.com
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "sh", "-c", "curl -f http://localhost:8000/health && curl -f http://localhost:3000 || exit 1"]
      interval: 30s
      timeout: 30s
      retries: 3
      start_period: 60s

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl/certs
    depends_on:
      - tracktrail
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Ensure ports 3000 and 8000 are not in use
   ```bash
   lsof -i :3000
   lsof -i :8000
   ```

2. **Build failures**: Check Docker logs and ensure all dependencies are available
   ```bash
   docker build --no-cache -t tracktrail .
   ```

3. **Permission issues**: On Linux, you might need to run Docker with sudo or add user to docker group

4. **Memory issues**: Increase Docker memory allocation in Docker Desktop settings

### Debug Mode

Enable debug mode by setting environment variables:

```bash
docker run -d \
  --name tracktrail-app \
  -p 3000:3000 \
  -p 8000:8000 \
  -e DEBUG=true \
  -e LOG_LEVEL=DEBUG \
  tracktrail
```

### Container Shell Access

```bash
# Access running container
docker exec -it tracktrail-app /bin/sh

# Or using the script
./docker.sh shell
```

## Cleanup

Remove all Docker resources:

```bash
# Using docker-compose
docker-compose down --rmi all --volumes

# Using the management script
./docker.sh clean

# Manual cleanup
docker stop tracktrail-app
docker rm tracktrail-app
docker rmi tracktrail
docker system prune -f
```

## Performance Optimization

### Build Optimization

1. **Multi-stage builds**: Already implemented to reduce final image size
2. **Layer caching**: Dependencies are installed before copying source code
3. **`.dockerignore`**: Excludes unnecessary files from build context

### Runtime Optimization

1. **Resource limits**: Set appropriate CPU and memory limits
   ```bash
   docker run -d \
     --name tracktrail-app \
     --memory="2g" \
     --cpus="2.0" \
     -p 3000:3000 \
     -p 8000:8000 \
     tracktrail
   ```

2. **Health checks**: Monitor service health and restart if needed
3. **Log rotation**: Configure log rotation to prevent disk space issues

## Support

For issues related to:
- **Docker setup**: Check this documentation and Docker logs
- **Frontend issues**: Check the frontend README and Next.js documentation
- **Backend issues**: Check the backend README and FastAPI documentation
- **API usage**: Visit http://localhost:8000/docs for interactive API documentation