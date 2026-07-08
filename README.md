# Pay-In Automation Testing Suite

## 🚀 Overview
Automated testing suite for fintech pay-in routing logic, gateway selection, MDR calculation, and webhook processing.

## 📋 Tests Included
1. **Priority Routing** - Verifies gateway selection follows priority order
2. **Failover Routing** - Tests gateway failover when primary fails
3. **Hybrid Routing** - Tests multiple gateways supporting same payment mode
4. **Default Routing** - Tests behavior when no priorities configured
5. **Retry Logic** - Verifies retry mechanism
6. **MDR Calculation** - Validates fee calculation
7. **Webhook Processing** - Tests webhook handling for all gateways
8. **End-to-End Flow** - Complete payment lifecycle test

## 🛠️ Setup

### 1. Install Dependencies
```bash
npm install