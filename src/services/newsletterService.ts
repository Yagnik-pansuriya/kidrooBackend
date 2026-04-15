import Newsletter from "../models/newsletter";
import AppError from "../utils/appError";

class NewsletterService {
  async subscribe(email: string) {
    const existing = await Newsletter.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      if (existing.isActive) {
        throw new AppError("This email is already subscribed", 400);
      }
      // Re-activate if previously unsubscribed
      existing.isActive = true;
      existing.subscribedAt = new Date();
      await existing.save();
      return existing;
    }
    return await Newsletter.create({ email: email.toLowerCase().trim() });
  }

  /**
   * MED-5: Paginated subscriber list — prevents OOM on large datasets.
   */
  async getAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [subscribers, total] = await Promise.all([
      Newsletter.find().sort({ subscribedAt: -1 }).skip(skip).limit(limit).lean(),
      Newsletter.countDocuments(),
    ]);
    return {
      subscribers,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getStats() {
    const total = await Newsletter.countDocuments();
    const active = await Newsletter.countDocuments({ isActive: true });
    return { total, active, inactive: total - active };
  }

  async remove(id: string) {
    const subscriber = await Newsletter.findByIdAndDelete(id);
    if (!subscriber) throw new AppError("Subscriber not found", 404);
    return subscriber;
  }

  async unsubscribe(email: string) {
    const subscriber = await Newsletter.findOne({ email: email.toLowerCase().trim() });
    if (!subscriber) throw new AppError("Email not found", 404);
    subscriber.isActive = false;
    await subscriber.save();
    return subscriber;
  }
}

export const newsletterService = new NewsletterService();
