# Horus webhook events

Generated from the OpenAPI document's `webhooks` section (35 events) by
`skills/scripts/generate-references.mjs`. Payload schemas are in the spec under
`components.schemas.<Schema>`. `data` holds the resource in the same shape the API returns it.

| Event | When | Payload schema |
|---|---|---|
| `sale.created` | A new eBay order was ingested. | `SaleCreatedEvent` |
| `sale.purchased` | The item was bought from the source (source order placed). | `SalePurchasedEvent` |
| `sale.purchase_failed` | Placing the source order failed. | `SalePurchaseFailedEvent` |
| `sale.shipped` | Tracking was uploaded to eBay. | `SaleShippedEvent` |
| `sale.delivered` | The carrier reports the package delivered. | `SaleDeliveredEvent` |
| `sale.cancelled` | The sale was cancelled. | `SaleCancelledEvent` |
| `sale.source_cancelled` | The retailer cancelled the source order; the sale is back to pending for re-fulfilment. | `SaleSourceCancelledEvent` |
| `sale.held` | Fulfilment was paused and needs attention (see `sale.hold_reason`). | `SaleHeldEvent` |
| `sale.refunded` | The buyer was refunded. | `SaleRefundedEvent` |
| `listing.created` | A listing went live on eBay. | `ListingCreatedEvent` |
| `listing.failed` | A listing could not be published. | `ListingFailedEvent` |
| `listing.ended` | A listing was ended on eBay. | `ListingEndedEvent` |
| `listing.repriced` | The price monitor changed a listing's price. | `ListingRepricedEvent` |
| `listing.out_of_stock` | The source went out of stock (Horus ends or pauses the listing). | `ListingOutOfStockEvent` |
| `listing.back_in_stock` | The source is back in stock. | `ListingBackInStockEvent` |
| `listing.relisted` | An ended listing was relisted. | `ListingRelistedEvent` |
| `account.session_lost` | The buyer account is no longer signed in on the desktop. | `AccountSessionLostEvent` |
| `account.session_restored` | The buyer account is signed in again. | `AccountSessionRestoredEvent` |
| `account.login_failed` | Signing the buyer account in failed. | `AccountLoginFailedEvent` |
| `account.recovered` | The account was recovered (password reset) and signed in. | `AccountRecoveredEvent` |
| `job.succeeded` | A desktop job finished successfully. | `JobSucceededEvent` |
| `job.failed` | A desktop job failed. | `JobFailedEvent` |
| `return.requested` | A buyer opened a return. | `ReturnRequestedEvent` |
| `return.processing` | The automatic return was started with the source (label on its way). | `ReturnProcessingEvent` |
| `return.label_sent` | The return label was posted to the buyer's eBay return case. | `ReturnLabelSentEvent` |
| `return.declined` | The return was declined. | `ReturnDeclinedEvent` |
| `return.completed` | The return was settled with a refund. | `ReturnCompletedEvent` |
| `message.received` | A new eBay message arrived (buyer, eBay or VeRO). | `MessageReceivedEvent` |
| `lead.assigned` | A lead was assigned to you. | `LeadAssignedEvent` |
| `sourcing.candidate_found` | Sourcing found a new profitable candidate. | `SourcingCandidateFoundEvent` |
| `ebay_account.token_expired` | eBay rejected the account's token; reconnect it. | `EbayAccountTokenExpiredEvent` |
| `ebay_account.reconnected` | An eBay account was connected or reconnected (OAuth completed). | `EbayAccountReconnectedEvent` |
| `desktop.online` | A paired Horus Desktop came online. | `DesktopOnlineEvent` |
| `desktop.offline` | A paired Horus Desktop stopped checking in. | `DesktopOfflineEvent` |
| `webhook.test` | A test event sent from the dashboard or `POST /webhooks/{id}/test`. Always delivered regardless of the filter. | `WebhookTestEvent` |

Subscribe with exact names, area wildcards (`sale.*`) or `*`.
