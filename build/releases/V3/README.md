# DiamondERP V3.0 Release - Security Keys & Credentials

This directory contains the production release builds for DiamondERP V3.0.0.

## 🔐 Security Keys & Access Passwords

DiamondERP V3 implements a Dual-Layer Protection Lock (Installer Setup Lock & First-Run App Activation Lock):

### 1. Installer Setup Security Key (Lock 1)
- Prompted on: Page 3 ("Additional Tasks") in `DiamondERP-3.0.0-Setup.exe`
- Password:
  Diamond@2026#SecureVault-SETUP

- Silent Installation Command:
  DiamondERP-3.0.0-Setup.exe /silent /key:Diamond@2026#SecureVault-SETUP

---

### 2. First-Run App Activation Key (Lock 2)
- Prompted on: Web browser interface upon first launching the application
- Password:
  Diamond@2026#SecureVault-APP

---

### 3. Default Admin Login
- Username: stavan
- Password:
  Stavan@123
- Profile: Stavan (Super Admin)
