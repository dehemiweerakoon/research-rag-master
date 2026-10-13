# Research RAG API

An Express.js API for collecting research papers, searching them with keyword or
vector similarity, uploading research PDFs, and asking questions over extracted
research content.

The application combines:

- **MongoDB** for users and authentication.
- **Supabase/Postgres** for papers, embeddings, uploaded research papers, and
  vector search functions.
- **OpenAlex** for collecting papers.
- **Hugging Face Transformers** for local text embeddings.
- **Google Gemini** for extracting PDF titles and generating research answers.

## Features

- JWT-based registration, login, and current-user lookup.
- Role-based admin endpoints for user management.
- Import up to 200 papers from OpenAlex for a search query.
- Keyword filtering by title, abstract, publication year, and citation count.
- Generate and store embeddings for imported papers.
- Semantic paper search using Supabase's `match_papers` RPC function.
- Upload PDF research papers to Supabase Storage.
- Extract, split, and embed PDF sections for retrieval-augmented generation.
- Ask questions against the uploaded research-paper chunks.
- Docker image and GitHub Actions CI configuration.

## Prerequisites

- Node.js **20 or 22**
- npm
- MongoDB (local or hosted)
- A Supabase project with:
  - a `papers` table
  - a `research_papers` table
  - a `research_paper_chunks` table
  - a `research-papers` Storage bucket
  - `match_papers` and `match_research_paper_chunks` PostgreSQL functions
- API credentials for Google Gemini and Hugging Face
- An OpenAlex API key is recommended for higher rate limits

## Installation

```bash
git clone <repository-url>
cd research-rag
npm install
```

Create a local environment file:

```bash
copy .env.example .env
```

On macOS/Linux, use:

```bash
cp .env.example .env
```

Then replace every placeholder in `.env` with a real value. Never commit
`.env` or paste credentials into source code.

## Configuration

The application reads the following variables from `.env`:

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | HTTP port. Defaults to `5000`. |
| `MONGO_URI` | Yes | MongoDB connection string. |
| `JWT_SECRET` | Yes | Secret used to sign and verify JWTs. Use a long random value. |
| `JWT_EXPIRES_IN` | Yes | JWT lifetime, for example `7d`. |
| `SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_KEY` | Yes | Supabase key permitted to access the configured data and storage. |
| `OPENALEX_API_KEY` | Recommended | OpenAlex API key. |
| `HF_TOKEN` | Yes | Hugging Face access token for the embedding service. |
| `GEMINI_API_KEY` | Yes | Google Gemini API key. |

Example `.env` values (placeholders only):

```dotenv
PORT=5000
MONGO_URI=mongodb://localhost:27017/research-rag
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=7d
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key
OPENALEX_API_KEY=your-openalex-key
HF_TOKEN=your-hugging-face-token
GEMINI_API_KEY=your-gemini-api-key
```

## Running locally

Start the server:

```bash
npm start
```

Run with Node's watch mode during development:

```bash
npm run dev
```

The health endpoint is available at:

```text
GET http://localhost:5000/
```

Expected response:

```json
{
  "message": "API is running"
}
```

## Authentication

Register or log in to obtain a JWT:

```bash
curl -X POST http://localhost:5000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Ada Lovelace\",\"email\":\"ada@example.com\",\"password\":\"password123\"}"
```

```bash
curl -X POST http://localhost:5000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"ada@example.com\",\"password\":\"password123\"}"
```

Send the returned token to protected endpoints:

```text
Authorization: Bearer <token>
```

New users receive the `user` role. User-management endpoints require an
account whose role is `admin`; promote an account directly in MongoDB or
through your application administration process.

## API reference

All routes below are prefixed with `http://localhost:5000/api` unless noted.

### Public authentication routes

| Method | Endpoint | Description | Body/query |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Create a user and return a token. | `{ "name", "email", "password" }` |
| `POST` | `/auth/login` | Authenticate a user and return a token. | `{ "email", "password" }` |
| `GET` | `/auth/me` | Return the authenticated user's profile. | Bearer token |

### Paper routes

All paper routes require a Bearer token.

| Method | Endpoint | Description | Body/query |
| --- | --- | --- | --- |
| `POST` | `/papers` | Fetch and save papers from OpenAlex. | `{ "query": "retrieval augmented generation" }` |
| `GET` | `/papers?q=...` | Search saved papers by title or abstract. | Optional `year`, `minCitations` |
| `POST` | `/papers/embeddings` | Generate embeddings for saved papers that do not have one. | None |
| `GET` | `/papers/semanticSearch?q=...` | Search papers using vector similarity. | Required `q` |

The `POST /papers` query can also be supplied as a query-string parameter:
`POST /api/papers?query=machine+learning`.

Example:

```bash
curl "http://localhost:5000/api/papers?q=transformers&year=2024&minCitations=10" ^
  -H "Authorization: Bearer <token>"
```

### Research-paper RAG routes

All suggestion routes require a Bearer token.

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/suggestions/upload` | Upload a PDF, extract sections, and create embeddings. |
| `POST` | `/suggestions/query` | Answer a question using relevant uploaded-paper chunks. |

Upload a PDF using multipart form data:

```bash
curl -X POST http://localhost:5000/api/suggestions/upload ^
  -H "Authorization: Bearer <token>" ^
  -F "file=@paper.pdf"
```

Ask a question:

```bash
curl -X POST http://localhost:5000/api/suggestions/query ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"question\":\"What problem does this paper address?\"}"
```

### Admin user routes

These routes require a Bearer token and the `admin` role.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/users` | List all users. |
| `GET` | `/users/:id` | Get one user by MongoDB ID. |
| `DELETE` | `/users/:id` | Delete one user by MongoDB ID. |

## Supabase setup

The API expects Supabase to provide both database and storage capabilities.
Before using the paper routes, configure vector columns with a dimension
matching the embedding model returned by `services/embeddingService.js`.

The RPC functions must accept the parameters used by the controllers:

- `match_papers(query_embedding, match_count)`
- `match_research_paper_chunks(query_embedding, match_count, filter_paper_ids)`

Make sure the `research-papers` Storage bucket exists and that its policies
allow the API key used by the server to upload files. Apply the least
permissive policies that fit your deployment.

## Docker

Build the image:

```bash
docker build -t research-rag .
```

Run it with an environment file:

```bash
docker run --env-file .env -p 5000:5000 research-rag
```

The container listens on port `5000` by default. MongoDB and Supabase must be
reachable from the container; `localhost` inside the container refers to the
container itself, not the host machine.

## Testing and CI

The current test script performs a Node.js syntax check:

```bash
npm test
```

GitHub Actions validates the project on Node.js 20 and 22 and builds the Docker
image on pushes to `main` or `master`.

## Project structure

```text
.
├── config/          Database and Supabase clients
├── controllers/     Request handlers and RAG processing
├── middleware/      JWT authentication and role authorization
├── models/          MongoDB schemas
├── routes/          Express route definitions
├── services/        Embeddings, title extraction, and section parsing
├── index.js         Application entry point
├── Dockerfile       Production container definition
└── package.json     Scripts and dependencies
```

## Security notes

- Keep `.env` out of version control; it is ignored by `.gitignore`.
- Use separate credentials for development and production.
- Rotate any credential that has been exposed in logs, screenshots, commits, or
  shared files.
- Use a strong, random `JWT_SECRET` in every deployed environment.
- Restrict CORS, Supabase policies, and database network access before
  deploying publicly.
- Validate uploaded files and apply request-size/rate limits at the deployment
  boundary when exposing the API to untrusted clients.

## License

This project currently declares the ISC license in `package.json`.
