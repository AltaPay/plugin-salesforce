# Changelog
All notable changes to this project will be documented in this file.

## [2.0.1]

### Added
- Extend `getOrder` endpoint to return MarketPay payment data. See [Get MarketPay Payment Status](https://github.com/AltaPay/plugin-salesforce/wiki/Composable-Storefront#get-marketpay-payment-status) for details.
- Optimize and reduce number of services.
### Fixed
- If MarketPay data mapping doesn’t exist do not return the SFCC payment method.

## [2.0.0]

### Added
- Introduced headless cartridge `cartridges/int_marketpay_headless` for Salesforce Composable Storefront (PWA).
- Added support for API-based payment flow integration.
- Added support for React-based PWA integration.
- Added payment form page styling options.