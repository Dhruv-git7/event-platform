# Test Credentials

## Default Admin Account
Email:    admin@platform.local
Password: Admin@123
Role:     admin

## How to create more accounts
POST http://localhost:4002/auth/register
Body:
{
  "name": "Your Name",
  "email": "you@example.com",
  "password": "yourpassword"
}

## Infrastructure
PostgreSQL:  localhost:5432  |  user: platform  |  pass: platform  |  db: platform
Redis:       localhost:6379
OpenSearch:  localhost:9200
Kafka:       localhost:9092
ClickHouse:  localhost:8123

## Service Ports
Receiver:     http://localhost:4000/ingest
WS Gateway:   http://localhost:4001
Auth API:     http://localhost:4002
Dashboard:    http://localhost:3000