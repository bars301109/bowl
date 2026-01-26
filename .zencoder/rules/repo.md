---
description: Repository Information Overview
alwaysApply: true
---

# Akylman Quiz Bowl Information

## Summary
Akylman Quiz Bowl is a web application for managing and conducting international knowledge competitions for students. It features team registration, real-time scoring, an admin panel for test management, and bilingual support (Russian/Kyrgyz). The project is designed for easy deployment on Render with support for both SQLite (local/dev) and PostgreSQL (production).

## Project Structure & Architecture
The repository follows a simplified monorepo-like structure where the backend and frontend are kept in separate top-level directories, but the backend serves the frontend as static assets.

- **backend/**: Contains the Express application.
  - `server.js`: Implements REST API endpoints for user authentication, quiz management, scoring, and file handling. It also includes the initialization logic that handles directory creation and database migrations.
  - `db.js`: A specialized database wrapper that abstracts the differences between SQLite and PostgreSQL, allowing the same codebase to run in different environments without modification.
  - `init.sql`: Contains the database schema definitions for initial setup.
- **frontend/**: A pure client-side application located in `frontend/src/`.
  - `pages/`: Contains HTML files for different application views (login, dashboard, quiz, admin).
  - `js/`: Application logic split into modules (e.g., `auth.js`, `quiz.js`, `admin.js`).
  - `css/`: Styling organized by component.
- **docs/**: Detailed documentation files providing guidance on persistent storage (Render Disks vs. PostgreSQL), email configuration (SMTP vs. API), and deployment troubleshooting.

## Database Strategy
The application employs a dual-database strategy to optimize for both development simplicity and production reliability:
- **Development**: Uses **SQLite** via `better-sqlite3`. Data is stored locally in the `data/` directory or a file specified by `DB_FILE`.
- **Production**: Designed for **PostgreSQL** when the `DATABASE_URL` environment variable is detected. The `db.js` adapter handles SQL syntax conversion (e.g., converting SQLite `?` placeholders to PostgreSQL `$n` format and translating auto-incrementing primary keys).
- **Migration**: On startup, `server.js` attempts to migrate existing SQLite data from legacy locations to the configured `DATA_DIR` to ensure persistence across deployments on platforms like Render.

## Deployment & Operations
The project is optimized for the **Render** platform:
- **Render Blueprints**: The `render.yaml` file defines a web service that automatically builds and starts the backend.
- **Persistent Storage**: Detailed guides in `docs/` explain how to use Render Disks for SQLite persistence or switch to a managed PostgreSQL instance for better scalability.
- **Email Integration**: Supports multiple email providers for password resets, including Gmail SMTP and HTTP-based APIs like Resend, configured via environment variables.

## Language & Runtime
**Language**: JavaScript (Node.js)  
**Version**: 18.x (as specified in `.node-version` and `backend/package.json`)  
**Build System**: NPM  
**Package Manager**: npm

## Dependencies
**Main Dependencies**:
- `express`: Web framework
- `better-sqlite3`: Local database engine
- `pg`: PostgreSQL client for production
- `bcryptjs`: Password hashing
- `jsonwebtoken`: Authentication
- `multer`: File uploads
- `nodemailer`: Email notifications

## Build & Installation
```bash
# Install dependencies
cd backend && npm install

# Start the server
cd backend && npm start
```

## Main Files & Resources
- `backend/server.js`: Main application entry point and Express server configuration.
- `backend/db.js`: Universal database adapter supporting SQLite and PostgreSQL.
- `frontend/src/index.html`: Main frontend entry point.
- `render.yaml`: Infrastructure-as-Code configuration for Render deployment.
- `docs/QUICK_START.md`: Primary guide for setting up persistent storage.

## Usage & Operations
- **Environment Variables**:
  - `DATABASE_URL`: Set this to use PostgreSQL in production.
  - `DATA_DIR`: Custom path for persistent storage (defaults to `/var/data` on Render).
  - `JWT_SECRET`: Secret key for authentication tokens.
  - `ADMIN_TOKEN`: Secret for admin access.
  - `EMAIL_PROVIDER`: 'resend' or 'gmail' for email services.

## Testing
The project uses JSON-based test files located in `data/tests/` or `backend/tests/`. There is no dedicated automated testing framework (like Jest) configured in `package.json`. Tests are managed via the admin panel within the application.
