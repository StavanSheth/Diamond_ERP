import { Prisma } from '@prisma/client';

export const buildDiamondWhereClause = (query: any): Prisma.DiamondItemWhereInput => {
  const where: Prisma.DiamondItemWhereInput = {};

  if (query.category) {
    where.category = query.category.toUpperCase();
  }
  if (query.shape) {
    where.shape = query.shape;
  }
  if (query.color) {
    where.color = query.color;
  }
  if (query.clarity) {
    where.clarity = query.clarity;
  }
  if (query.cut) {
    where.cut = query.cut;
  }
  if (query.symmetry) {
    where.symmetry = query.symmetry;
  }
  if (query.polish) {
    where.polish = query.polish;
  }
  
  if (query.minCarat || query.maxCarat) {
    where.carat = {};
    if (query.minCarat) where.carat.gte = parseFloat(query.minCarat);
    if (query.maxCarat) where.carat.lte = parseFloat(query.maxCarat);
  }

  if (query.minPrice || query.maxPrice) {
    where.currentValue = {};
    if (query.minPrice) where.currentValue.gte = parseFloat(query.minPrice);
    if (query.maxPrice) where.currentValue.lte = parseFloat(query.maxPrice);
  }

  // Type of Transaction - check if the diamond has an event matching the transaction type
  if (query.transactionType) {
    where.events = {
      some: {
        transaction: {
          transactionType: query.transactionType.toUpperCase()
        }
      }
    };
  }

  return where;
};
