param(
  [string]$BaseUrl = "http://localhost:3000",
  [int]$TimeoutSeconds = 20
)

$ErrorActionPreference = "Stop"

function Invoke-JsonPost($Path, $Body = $null) {
  $params = @{
    Uri = "$BaseUrl$Path"
    Method = "Post"
    TimeoutSec = 10
  }

  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Compress)
  }

  Invoke-RestMethod @params
}

function Invoke-JsonGet($Url) {
  Invoke-RestMethod -Uri $Url -TimeoutSec 10
}

function Wait-ForOrderStatus($OrderId, $ExpectedStatus) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $result = Invoke-JsonGet "$BaseUrl/_teacher/orders/$OrderId"
    if ($result.order.status -eq $ExpectedStatus) {
      return $result.order
    }

    Start-Sleep -Milliseconds 500
  }

  $latest = Invoke-JsonGet "$BaseUrl/_teacher/orders/$OrderId"
  throw "Order $OrderId did not reach status '$ExpectedStatus'. Latest status: '$($latest.order.status)'"
}

function Assert-Equal($Name, $Actual, $Expected) {
  if ($Actual -ne $Expected) {
    throw "$Name expected '$Expected' but got '$Actual'"
  }

  Write-Host "PASS $Name = $Actual"
}

Write-Host "Checking service health..."
$healthPorts = 3000, 3001, 3002, 3003, 3004, 3005
foreach ($port in $healthPorts) {
  $health = Invoke-JsonGet "http://localhost:$port/health"
  Assert-Equal "health:$port" $health.status "ok"
}

Write-Host "Resetting classroom state..."
$reset = Invoke-JsonPost "/_teacher/reset"
Write-Host "PASS reset: $($reset.message)"

Write-Host "Running successful checkout..."
$success = Invoke-JsonPost "/checkout" @{
  userId = "student-1"
  productId = "pencil"
  quantity = 2
}
$completedOrder = Wait-ForOrderStatus $success.order.orderId "completed"
Assert-Equal "success order status" $completedOrder.status "completed"
$stockAfterSuccess = Invoke-JsonGet "$BaseUrl/_teacher/stock"
Assert-Equal "pencil stock after success" $stockAfterSuccess.stock.pencil 8

Write-Host "Running out-of-stock checkout..."
$outOfStock = Invoke-JsonPost "/checkout" @{
  userId = "student-1"
  productId = "laptop"
  quantity = 1
}
$cancelledOutOfStockOrder = Wait-ForOrderStatus $outOfStock.order.orderId "cancelled"
Assert-Equal "out-of-stock order status" $cancelledOutOfStockOrder.status "cancelled"

Write-Host "Running payment-failure checkout..."
$paymentFailure = Invoke-JsonPost "/checkout" @{
  userId = "fail-payment"
  productId = "pencil"
  quantity = 1
}
$cancelledPaymentOrder = Wait-ForOrderStatus $paymentFailure.order.orderId "cancelled"
Assert-Equal "payment-failure order status" $cancelledPaymentOrder.status "cancelled"
$stockAfterPaymentFailure = Invoke-JsonGet "$BaseUrl/_teacher/stock"
Assert-Equal "pencil stock after compensation" $stockAfterPaymentFailure.stock.pencil 8

Write-Host "Running invalid checkout..."
try {
  Invoke-JsonPost "/checkout" @{
    userId = "student-1"
    productId = "pencil"
    quantity = 0
  } | Out-Null

  throw "Invalid checkout unexpectedly succeeded"
} catch {
  $response = $_.Exception.Response
  if ($null -eq $response) {
    throw
  }

  Assert-Equal "invalid checkout status" ([int]$response.StatusCode) 400
}

Write-Host "Smoke test passed."
