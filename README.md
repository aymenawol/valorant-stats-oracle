# ValMuse v1

Natural language search for Valorant pro stats, powered by VLR.gg.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + shadcn/ui + Tailwind CSS |
| Backend | Python + FastAPI |
| Scraping | httpx + BeautifulSoup4 |
| Cache | Redis (Upstash) |

## Getting Started

### Frontend

```sh
cd valorant-stats-oracle
npm install
npm run dev
```

### Backend

```sh
cd valorant-stats-oracle/backend
python -m venv .venv
.venv/Scripts/activate      # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

### Environment Variables

**Backend** (`backend/.env`):
```
REDIS_URL=redis://localhost:6379
VLR_BASE_URL=https://www.vlr.gg/stats
RATE_LIMIT_RPS=1
```

**Frontend** (`.env`):
```
VITE_API_URL=http://localhost:8000
```

## Supported Queries

- "highest ACS"
- "best Jett players"
- "top players on Bind"
- "best NA players past 60 days"
- "top 10 KD this month"
- "best Duelist players in EMEA"
