const EMPLOYEE_RATE = 0.12;
const EMPLOYER_RATE = 0.12;
const INTEREST_RATE = 0.0825;

function getPfDetails({ basic = 0, years_of_service = 3 } = {}) {
  const monthly_basic = basic / 12;
  const employee_monthly = monthly_basic * EMPLOYEE_RATE;
  const employer_monthly = monthly_basic * EMPLOYER_RATE;
  const annual_contribution = (employee_monthly + employer_monthly) * 12;

  let balance = 0;
  for (let i = 0; i < years_of_service; i++) {
    balance = (balance + annual_contribution) * (1 + INTEREST_RATE);
  }

  return {
    employee_contribution: Math.round(employee_monthly * 12),
    employer_contribution: Math.round(employer_monthly * 12),
    monthly_employee_contribution: Math.round(employee_monthly),
    monthly_employer_contribution: Math.round(employer_monthly),
    interest_rate: INTEREST_RATE,
    years_of_service,
    balance: Math.round(balance),
    last_updated: new Date().toISOString().slice(0, 10),
  };
}

module.exports = { getPfDetails };
