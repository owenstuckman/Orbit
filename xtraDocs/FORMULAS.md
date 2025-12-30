## Payout Formulas

See Wiki for more documentation and detailed explanations of the original though process

### Employee Salary
```
salary = base_salary * r + task_value * (1 - r)
```
Where `r` is the employee's chosen stability ratio (0.5 - 0.9)

### QC Shapley Values
```
d_1 = β * p_0 * V           (first pass marginal)
d_k = d_1 * γ^(k-1)         (geometric decay)
QC_payout = Σ d_k for k=1..K
```

### PM Profit Sharing
```
payout = (budget - spent) * X - overdraft * (1.5 * X) + bonus
```
