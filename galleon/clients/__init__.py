"""
galleon/clients — External data source clients.

Each module provides async-safe, rate-limited access to a free public API:
  - fdic_client: FDIC bank data (institutions, financials, failures)
  - sba_client: SBA loan data via USASpending
  - usaspending_client: Federal awards (contracts, grants, loans)
  - opencorporates_client: Corporate registry data
  - ucc_client: UCC filing aggregation
"""
