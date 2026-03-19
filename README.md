# Australian Mortgage Calculator

A simple web application to calculate mortgage repayments for Australian home loans.

## Features

- Calculate repayments for different frequencies (monthly, fortnightly, weekly)
- Adjustable loan amount, interest rate, and loan term
- Shows total repayments and total interest paid
- Responsive design
- Australian dollar formatting

## Usage

Simply open `index.html` in your web browser. No build process or server required.

## Calculation Formula

Uses the standard mortgage repayment formula:
```
M = P * [r(1+r)^n] / [(1+r)^n - 1]
```

Where:
- M = Periodic repayment amount
- P = Principal loan amount
- r = Periodic interest rate
- n = Total number of payments
