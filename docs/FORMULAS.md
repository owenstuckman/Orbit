# Payout Formulas

Quick reference for all payout calculations. See Wiki for detailed explanations and original rationale.

## Employee Salary

```
salary = base_salary * r + task_value * (1 - r)
```

| Variable | Description | Default |
|----------|-------------|---------|
| `r` | Stability ratio (employee's choice) | 0.7 |
| `r_bounds` | Allowed range for `r` | [0.5, 0.9] |
| `base_salary` | Monthly base salary | per employee |
| `task_value` | Sum of completed task values | calculated |

## QC Shapley Values

```
d_1 = beta * p_0 * V           (first pass marginal)
d_k = d_1 * gamma^(k-1)        (geometric decay for pass k)
QC_payout = sum(d_k) for k=1..K
```

| Variable | Description | Default |
|----------|-------------|---------|
| `V` | Task dollar value | per task |
| `p_0` | AI confidence score | 0.0-1.0 |
| `beta` | Confidence scaling coefficient | 0.25 |
| `gamma` | Geometric decay factor | 0.4 |
| `K` | Number of QC passes | varies |

**Budget normalization** (when marginals exceed budget):
```
alpha = min(1, (V - v_0) / (d_1 / (1 - gamma)))
d_k_normalized = d_k * alpha
```

## PM Profit Sharing

```
payout = (budget - spent) * X - overdraft * (penalty * X) + bonus
```

| Variable | Description | Default |
|----------|-------------|---------|
| `budget` | Project total value | per project |
| `spent` | Amount spent on tasks | calculated |
| `X` | Profit share rate | 0.5 |
| `penalty` | Overdraft penalty multiplier | 1.5 |
| `bonus` | Additional PM bonus | per project |
| `overdraft` | max(0, spent - budget) | calculated |

## Sales Commission

Commission decays based on how quickly a PM picks up the project:

```
commission = base_commission * decay_factor(days_to_pickup)
```

The decay function incentivizes quick PM assignment.
