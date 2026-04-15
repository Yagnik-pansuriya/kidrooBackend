import Review from "../models/review";
import Product from "../models/products";
import AppError from "../utils/appError";
import mongoose from "mongoose";

class ReviewService {
  // Get all reviews for a product (approved only for public)
  async getProductReviews(productId: string, onlyApproved = true) {
    const filter: any = { product: productId };
    if (onlyApproved) filter.isApproved = true;
    return await Review.find(filter).sort({ createdAt: -1 }).lean();
  }

  // Get review stats for a product
  async getProductStats(productId: string) {
    const stats = await Review.aggregate([
      { $match: { product: mongoose.Types.ObjectId.createFromHexString(productId), isApproved: true } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          rating5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
          rating4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
          rating3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
          rating2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
          rating1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
        },
      },
    ]);
    return stats[0] || { avgRating: 0, totalReviews: 0, rating5: 0, rating4: 0, rating3: 0, rating2: 0, rating1: 0 };
  }

  // Add a review
  async addReview(data: { product: string; name: string; rating: number; title: string; comment: string; user?: string }) {
    const review = await Review.create({
      product: data.product,
      user: data.user || null,
      name: data.name,
      rating: data.rating,
      title: data.title,
      comment: data.comment,
    });

    // Update product rating stats
    await this.updateProductRating(data.product);
    return review;
  }

  // Delete a review (admin)
  async deleteReview(reviewId: string) {
    const review = await Review.findByIdAndDelete(reviewId);
    if (!review) throw new AppError("Review not found", 404);
    await this.updateProductRating(review.product.toString());
    return review;
  }

  // Toggle approval (admin)
  async toggleApproval(reviewId: string) {
    const review = await Review.findById(reviewId);
    if (!review) throw new AppError("Review not found", 404);
    review.isApproved = !review.isApproved;
    await review.save();
    await this.updateProductRating(review.product.toString());
    return review;
  }

  // Get all reviews (admin — across all products, paginated)
  // MED-5: Pagination prevents OOM on large review datasets
  async getAllReviews(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      Review.find()
        .populate("user", "name email")
        .populate("product", "productName slug")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(),
    ]);
    return { reviews, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // Recalculate product rating
  private async updateProductRating(productId: string) {
    const stats = await Review.aggregate([
      { $match: { product: require("mongoose").Types.ObjectId.createFromHexString(productId), isApproved: true } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    const avg = stats[0]?.avg || 0;
    const count = stats[0]?.count || 0;
    await Product.findByIdAndUpdate(productId, { ratings: Math.round(avg * 10) / 10, numReviews: count });
  }
}

export const reviewService = new ReviewService();
