import { Model } from "mongoose";
import { getPagination } from "./splitPagination";

interface PaginateOptions {
  model: Model<any>;
  query: Record<string, any>;
  filter?: Record<string, any>;
  sort?: Record<string, any> | string;
  populate?: any[];
  select?: string;
}

export const paginateQuery = async ({
  model,
  query,
  filter = {},
  sort = { createdAt: -1 },
  populate = [],
  select = "",
}: PaginateOptions) => {

  const { page, limit, skip } = getPagination(query);

  const total = await model.countDocuments(filter);

  let mongooseQuery = model
    .find(filter)
    .skip(skip)
    .limit(limit)
    .sort(sort)
    .select(select);

  if (populate.length) {
    populate.forEach((p) => {
      mongooseQuery = mongooseQuery.populate(p);
    });
  }

  const data = await mongooseQuery;

  return {
    data,
    total,
    page,
    limit,
  };
};