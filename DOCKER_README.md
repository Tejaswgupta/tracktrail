# Docker Setup for TrackTrail Backend

This document provides comprehensive instructions for running the TrackTrail backend using Docker.

## Prerequisites

- Docker Engine 20.10 or later
- Docker Compose 2.0 or later
- At least 1GB of available RAM
- Supabase project URL and API keys

## Quick Start

### 1. Environment Configuration

Copy the example environment file in the backend folder and configure it:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in your actual values:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key
- Optional: `OPENAI_API_KEY` if using AI features

### 2. Development Mode

Start the backend with hot-reload enabled:

```bash
# Using default docker-compose.yml (development mode)
docker-compose up --build

# Or explicitly use development config
docker-compose -f docker-compose.dev.yml up --build
```

The backend API will be available at:

- **Backend API**: http://localhost:3011
- **API Documentation**: http://localhost:3011/docs
- **Health Check**: http://localhost:3011/health

### 3. Production Mode

For production deployment:

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

## Docker Compose Files

### `docker-compose.yml` (Default)

- Development configuration with hot-reload
- Mounts backend code as volume
- Runs with `--reload` flag for uvicorn

### `docker-compose.dev.yml`

- Explicit development configuration
- Same as default but can be customized separately
- Useful for different development setups

### `docker-compose.prod.yml`

- Production-optimized configuration
- No volume mounts for code
- Optimized builds
- Includes logging and health checks
- Used by CI/CD pipeline

## Dockerfile

### Backend (`backend/Dockerfile`)

Multi-stage build using `uv` package manager:

1. **Builder Stage**: Installs dependencies
2. **Runtime Stage**: Minimal Python 3.11 runtime
3. Uses non-root user for security
4. Includes health checks

Key features:

- Fast builds with `uv` package manager (10-100x faster than pip)
- Small final image size
- Security-focused (non-root user)
- Health check endpoint at `/health`

## Common Commands

### Build and Start

```bash
# Development (with hot-reload)
docker-compose up --build

# Production (detached)
docker-compose -f docker-compose.prod.yml up -d --build

# Rebuild backend
docker-compose build backend
```

### Stop Services

```bash
# Stop running containers
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Stop production containers
docker-compose -f docker-compose.prod.yml down
```

### View Logs

```bash
# View all logs
docker-compose logs -f

# View backend logs
docker-compose logs -f backend

# View last 100 lines
docker-compose logs --tail=100 backend
```

### Access Container

```bash
# Access backend container
docker-compose exec backend bash

# Run Python command in container
docker-compose exec backend python -c "import polars; print(polars.__version__)"

# Check uvicorn version
docker-compose exec backend uvicorn --version
```

### Health Checks

```bash
# Check backend health
curl http://localhost:3011/health

# Check API documentation
curl http://localhost:3011/docs

# View container health status
docker-compose ps
```

## Environment Variables

| Variable            | Description            | Default                         | Required |
| ------------------- | ---------------------- | ------------------------------- | -------- |
| `SUPABASE_URL`      | Supabase project URL   | -                               | Yes      |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | -                               | Yes      |
| `DEBUG`             | Enable debug mode      | `false`                         | No       |
| `LOG_LEVEL`         | Logging level          | `INFO`                          | No       |
| `CORS_ORIGINS`      | Allowed CORS origins   | `http://localhost:3000`         | No       |
| `OPENAI_API_KEY`    | OpenAI API key         | -                               | No       |
| `OPENAI_BASE_URL`   | OpenAI base URL        | `https://model.thevotum.com/v1` | No       |

## Troubleshooting

### Port Already in Use

If port 3011 is already in use:

```bash
# Change port in docker-compose.yml
ports:
  - "3012:3011"  # Use 3012 instead of 3011
```

### Backend Crashes Immediately

Check backend logs:

```bash
docker-compose logs backend
```

Common issues:

- Missing environment variables in `backend/.env`
- Supabase connection failed
- Database migration needed

### Build Fails

```bash
# Clear Docker cache and rebuild
docker-compose build --no-cache backend
docker-compose up backend
```

### Volume Permission Issues

If you encounter permission errors with mounted volumes:

```bash
# Fix backend directory permissions
sudo chown -R $USER:$USER backend/
```

### Health Check Failing

The health check expects the `/health` endpoint to return 200. Check:

- Backend is running on port 3011
- No startup errors in logs
- Database connection is working

## CI/CD Integration

The project includes a GitHub Actions workflow (`.github/workflows/ci-cd.yml`) that:

1. Triggers on push to `main` branch
2. Connects to remote VM via SSH
3. Pulls latest code
4. Builds and starts backend with `docker-compose.prod.yml`
5. Prunes unused Docker images

Required GitHub Secrets:

- `HOST`: Server hostname/IP
- `USERNAME`: SSH username
- `SSH_KEY`: Private SSH key

## Running with Frontend

The frontend should be run separately (not via Docker):

```bash
# Terminal 1: Start backend with Docker
docker-compose up

# Terminal 2: Start frontend locally
cd frontend
pnpm install
pnpm dev
```

The frontend will connect to the backend at `http://localhost:3011`.

## Performance Optimization

### Backend Optimization

- Uses `uv` for 10-100x faster dependency installation
- Multi-stage build reduces final image size
- Non-root user improves security
- Health checks ensure reliability

### Resource Limits

Add to `docker-compose.yml` if needed:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 1G
        reservations:
          cpus: "0.5"
          memory: 512M
```

## Security Best Practices

1. **Never commit `backend/.env` file** - Use `backend/.env.example` as template
2. **Use non-root user** - Already configured in Dockerfile
3. **Minimal base image** - Using Python 3.11 slim variant
4. **Health checks** - Monitor service health
5. **CORS configuration** - Restrict in production
6. **Volume mounts** - Only in development, never in production

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [uv Package Manager](https://github.com/astral-sh/uv)

## Support

For issues or questions:

1. Check logs: `docker-compose logs -f backend`
2. Verify environment variables in `backend/.env`
3. Ensure port 3011 is available
4. Check Supabase connection
5. Review health status: `docker-compose ps`

trigger build
