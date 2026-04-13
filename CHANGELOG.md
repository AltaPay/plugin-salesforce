# Changelog
All notable changes to this project will be documented in this file.

## [2.0.6]

### Added
- Implemented order token functionality to validate the order.
- Improved error handling for afterPOST processes
- Filter out UserLocale query param when appending URL
- Update payment transaction amount to use transaction captured amount.

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