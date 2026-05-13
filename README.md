# IncomeTax Backend

Node.js + Express + MongoDB backend for the IncomeTax (TaxWise) frontend.

## Setup

```bash
cd IncomeTax_Backend
cp .env.example .env   # edit MONGODB_URI / AUTH_SECRET
npm install
npm run dev            # nodemon on PORT (default 5000)
```

Make sure MongoDB is running locally (`mongod`) or point `MONGODB_URI` at Atlas.

## Environment

| Var           | Default                                |
| ------------- | -------------------------------------- |
| `PORT`        | `5000`                                 |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/incometax`  |
| `AUTH_SECRET` | dev placeholder — change in prod       |
| `COOKIE_NAME` | `taxwise_token`                        |
| `CORS_ORIGIN` | `http://localhost:3000`                |

## Endpoints

All under `/api`:

- `POST /auth/register` — `{name, email, password}`
- `POST /auth/login` — `{email, password}`
- `POST /auth/logout`
- `GET  /auth/me`
- `GET  /profile`
- `PUT  /profile` — `{pan, phone, salary, tax_input, last_result}`
- `POST /upload` — multipart file or `{text}`
- `POST /tax/calculate`
- `GET  /pf/details?basic&years`
- `GET  /investments`
- `POST /investments` — `{pf, deductions}`
- `GET  /itr/rules`
- `GET  /health`

Auth: HTTP-only JWT cookie (`taxwise_token`). Same secret + name as Next.js middleware so frontend cookie auth keeps working when frontend proxies to backend.

## Mongo collections

- `users` — `{name, email, passwordHash}`
- `profiles` — `{user, pan, phone, salary, tax_input, last_result}`
