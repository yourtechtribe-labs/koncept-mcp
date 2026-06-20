# Regression fixture — the actual Ebury #301 offender shape.
# This standalone sync invalidates the BANKING cache but NOT the projection cache.
# Result in prod: /treasury showed 87.167,92 € while /cashflow kept a stale opening
# balance of 56.213,55 €. The `implication` check must flag this file.

class EburyTreasurySync:
    def run_full_sync(self):
        records = self._fetch()
        self._persist(records)
        self._link_to_treasury(records)
        # Banking cache invalidated...
        BankingCacheService().invalidate(self.company_id)
        # ...but the projection cache is never invalidated here. <-- the loose end.
