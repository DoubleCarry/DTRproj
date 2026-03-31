# DTR Backend (MongoDB)

Simple API for your DTR app using **Express + MongoDB (Mongoose)**.

## 1) Setup

```bash
cd backend
npm install
cp .env.example .env
```

Fill `.env`:

- `MONGODB_URI`: MongoDB Atlas connection string
- `JWT_SECRET`: long random secret
- `CORS_ORIGIN`: your frontend URL (for local: `http://localhost:5500`)

## 2) Run

```bash
npm run dev
```

Health check:

`GET http://localhost:4000/api/health`

## 3) Main Endpoints

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token)
- `PUT /api/users/me/settings` (Bearer token)
- `PUT /api/users/admin/reset-password` (Bearer token, admin only)
- `GET /api/sessions/me` (Bearer token)
- `POST /api/sessions/me` (Bearer token)
- `PUT /api/sessions/me/:id` (Bearer token)
- `DELETE /api/sessions/me/:id` (Bearer token)
- `DELETE /api/sessions/me` (Bearer token)

## 4) Frontend Integration Plan

Your current app uses `localStorage`. Next step is to add an API layer in `js/storage.js`:

1. Keep current storage functions as fallback.
2. Add `API_BASE_URL` and token storage.
3. Map login/signup/settings/sessions to backend routes.
4. Migrate gradually screen-by-screen.

