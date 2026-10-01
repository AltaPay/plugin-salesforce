# Changelog
All notable changes to this project will be documented in this file.

## [3.0.0]

### Changed
- **Breaking:** In the `int_marketpay_headless` cartridge, retired the SFRA `MarketPay-*` storefront controllers (`CallbackForm`, `PaymentSuccess`, `PaymentFail`, `PaymentNotification`). MarketPay callback handling now goes through Managed Runtime (MRT) and SCAPI custom endpoints (`rest-apis/marketpay`) instead, so payment confirmation keeps working even when Storefront Protection.
- The `marketPayCallbackBaseURL` site preference ("MRT Base URL for Callbacks") now controls where MarketPay sends callbacks. It must point at a deployed Managed Runtime environment running the companion `marketpay-salesforce-pwa` npm package.

### Removed
- Removed the `Known IP Protection` and `Callback Secret` site preferences — this logic now lives in the PWA/MRT app's own environment variables (`MARKETPAY_KNOWN_IP_PROTECTION`, `MARKETPAY_SIGNATURE_PROTECTION`, `MARKETPAY_CALLBACK_SECRET`).

**Upgrade note**
> This is a breaking change. Before upgrading:
> 1. Deploy the `marketpay-salesforce-pwa` npm package to a Managed Runtime environment.
> 2. Grant the SLAS client used by that environment the `c_marketpaycallbacks_rw`, `c_checkoutsession_rw`, and `c_paymentstatus_rw` custom scopes (Business Manager > Administration > Site Development > Salesforce Commerce API Client Settings) — callbacks fail with a 403 without these.
> 3. Update the `marketPayCallbackBaseURL` site preference to point at that environment.
>
> Do not upgrade to this version until this setup is complete.

## [2.1.0]

### Added
- Add support for the Native App Flow: merchants can now specify `c_marketPayAppReturnURL` in `/payment-instruments` to have MarketPay redirect back to merchant app URL and to flag the session as `isNativeFlow`, alongside the existing `c_marketPayPlatform:app` web-based app flow.

**Note**
> Validate `c_marketPayAppReturnURL` against a new `marketPayAppReturnURLAllowlist` site preference before storing it, to prevent the shopper-supplied value from being used as an open redirect.

## [2.0.9]

### Added
- Add signature verification to enhance the callbacks security.

### Fixed
- Fix default form styling and Bancontact form conflicts

## [2.0.8]

### Added
- Merchants can now specify `c_marketPayPlatform:app` in `/payment-instruments` to enable the mobile app flow.

## [2.0.7]

### Fixed
- Payment failed when the order line description exceeded 50 characters.
- CapturedAmount is used instead of ReservedAmount in order payment setAmount.
- Create a custom job to process notification requests asynchronously.
- Set the order status to **Paid** only if the order has been captured.

## [2.0.6]

### Added
- Implemented order token functionality to validate the order.
- Improved error handling for afterPOST processes
- Filter out UserLocale query param when appending URL
- Update payment transaction amount to use transaction captured amount.
### Fixed
- On reject payment, PaymentNotification is called that is placing the order.

## [2.0.5]

### Added
- Remove the order number and replace it with parameters from the success and fail URLs.
- Make the payment success and fail URLs localizable.
- Set the payment status when the order is completed.

## [2.0.4]

### Added
- Add placeOrder to module exports.
- Move functions from controllers to helper files to improve extensibility.
- Update payment transaction amount to use transaction captured amount.
### Fixed
- Add missing meta fields.

## [2.0.3]

### Added
- Support non-market pay payment methods.
### Fixed
- Fix: Order amount does not match order lines.
- Bug fixes.

## [2.0.2]

### Added
- Handle duplicate payment request against the same order ID.- Support Known IP Protection for callbacks.
### Fixed
- Fix: Handle multiple transactions conflict on callback.
- Minor bug fixes.

## [2.0.1]

### Added
- Extend `getOrder` endpoint to return MarketPay payment data. See [Get MarketPay Payment Status](https://github.com/AltaPay/plugin-salesforce/wiki/Composable-Storefront#get-marketpay-payment-status) for details.
- Optimize and reduce number of services.
- Store MarketPay transaction data in the SFCC order.
### Fixed
- If MarketPay data mapping doesn’t exist do not return the SFCC payment method.

## [2.0.0]

### Added
- Introduced headless cartridge `cartridges/int_marketpay_headless` for Salesforce Composable Storefront (PWA).
- Added support for API-based payment flow integration.
- Added support for React-based PWA integration.
- Added payment form page styling options.