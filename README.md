# Record Store Challenge API
## Description

This is a **NestJS** application with MongoDB integration, async job queue (BullMQ), and migrations. This setup includes end-to-end tests, unit tests, test coverage, linting, and database setup with data from `data.json`.

## Quick Start

Get the project running locally in one command:

```bash
$ npm install
$ npm run setup:init
```

Then start the app:

```bash
$ npm run start:dev
```

The API will be running at `http://localhost:3000` with documentation at `http://localhost:3000/api`.

---

## Detailed Setup Instructions

### 1. Install Dependencies

```bash
$ npm install
```

### 2. Environment Configuration

Create a `.env` file from the template:

```bash
$ npm run setup:env
```

This copies `.env.example` to `.env` if not already present. Edit `.env` to customize settings

### 3. Start Local Infrastructure

Start MongoDB and Redis via Docker:

```bash
$ npm run infra:start
```

Services will be available at:
- **MongoDB**: `mongodb://localhost:27017`
- **Redis**: `localhost:6379`

To stop services:

```bash
$ npm run infra:stop
```

### 4. Run Database Migrations

Apply all pending schema migrations:

```bash
$ npm run migrate:up
```

Check migration status:

```bash
$ npm run migrate:status
```

Rollback the latest migration:

```bash
$ npm run migrate:down
```

Create a new migration file:

```bash
$ npm run migrate:create -- your-migration-name
```

Migration files live in `migrations/`, and applied migration state is tracked in MongoDB's `migrations_changelog` collection.

### 5. Seed Example Data (Optional)

Populate the database with example records from `data.json`:

```bash
$ npm run seed:data
```

This will prompt whether to clear existing records before importing.


---

## Running the Application

### Development Mode (Hot Reload)

```bash
$ npm run start:dev
```

The server will start at `http://localhost:3000` with live reload enabled.

### Production Mode

Build and run in production:

```bash
$ npm run build
$ npm run start:prod
```

---

## Testing

### Unit Tests

Run all unit tests:

```bash
$ npm run test
```

Run tests in watch mode:

```bash
$ npm run test:watch
```

Run tests with coverage report:

```bash
$ npm run test:cov
```

### End-to-End Tests

Run all e2e tests:

```bash
$ npm run test:e2e
```

---

## Code Quality

### Linting & Formatting

Run ESLint and fix issues:

```bash
$ npm run lint
```

Format code with Prettier:

```bash
$ npm run format
```

### Type Checking

Type-check application code:

```bash
$ npm run typecheck
```

Type-check test code:

```bash
$ npm run typecheck:test
```

---

## Project Structure

### TypeScript Configuration

This project uses separate TypeScript configs:

- `tsconfig.json` — Base config for app/dev code (Node types only)
- `tsconfig.build.json` — Production build config (excludes tests)
- `tsconfig.spec.json` — Test config (Jest + Node types)

Jest automatically uses `tsconfig.spec.json` for test compilation.

### Git Hooks

This project uses **Husky** for git hooks. Pre-commit hooks run linting and type checks before each commit.

---

## Architecture Notes

### Async Job Queue

This project uses **BullMQ** with **Redis** for async job processing:

- When a record is created/updated with a MusicBrainz ID (mbid), a tracklist fetch job is enqueued
- The API responds immediately with an empty tracklist
- Jobs are processed asynchronously in the background with 3 retries and exponential backoff
- Once a job completes successfully, the record's tracklist is updated in the database

Failed jobs are retained in the queue for inspection and debugging.

### Database Migrations

Versioned migrations are applied automatically when the app starts. New migrations can be created and are tracked in MongoDB's `migrations_changelog` collection.
This command will show you any linting issues with your code.

