import mongoose from "mongoose";
import InventoryTransaction, { IInventoryTransaction } from "../models/inventoryTransaction";
import Product from "../models/products";
import ProductVariant from "../models/variants";

class InventoryService {
  /**
   * Automatically detect if target is a Product or ProductVariant
   * and deduct stock atomically. Logs the transaction.
   */
  async deductStock(
    targetModel: "Product" | "ProductVariant",
    targetId: string,
    quantity: number,
    reference?: string,
    notes?: string
  ) {
    if (quantity <= 0) throw new Error("Quantity to deduct must be greater than 0");

    const Model = targetModel === "Product" ? Product : ProductVariant;
    
    // Atomically decrement stock only if sufficient stock exists
    const updated = await (Model as any).findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(targetId), stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { new: true }
    );

    if (!updated) {
      throw new Error(`Insufficient stock or ${targetModel} not found for ID: ${targetId}`);
    }

    // Log the transaction
    await InventoryTransaction.create({
      targetModel,
      targetId: new mongoose.Types.ObjectId(targetId),
      quantity: -quantity,
      type: "PURCHASE",
      reference,
      notes: notes || "Stock deducted for purchase",
    });

    return updated;
  }

  /**
   * Add stock (Restock or Return) exactly like deduct, but increments.
   */
  async addStock(
    targetModel: "Product" | "ProductVariant",
    targetId: string,
    quantity: number,
    type: "RESTOCK" | "RETURN" | "ADJUSTMENT" = "RESTOCK",
    reference?: string,
    notes?: string
  ) {
    if (quantity <= 0) throw new Error("Quantity to add must be greater than 0");

    const Model = targetModel === "Product" ? Product : ProductVariant;

    const updated = await (Model as any).findByIdAndUpdate(
      new mongoose.Types.ObjectId(targetId),
      { $inc: { stock: quantity } },
      { new: true }
    );

    if (!updated) {
      throw new Error(`${targetModel} not found for ID: ${targetId}`);
    }

    // Log the transaction
    await InventoryTransaction.create({
      targetModel,
      targetId: new mongoose.Types.ObjectId(targetId),
      quantity: quantity,
      type,
      reference,
      notes: notes || `Stock added via ${type}`,
    });

    return updated;
  }

  /**
   * Get the history of transactions for a specific product or variant
   */
  async getStockHistory(targetModel: "Product" | "ProductVariant", targetId: string) {
    return await InventoryTransaction.find({ 
      targetModel, 
      targetId: new mongoose.Types.ObjectId(targetId) 
    }).sort({ createdAt: -1 });
  }
}

export const inventoryService = new InventoryService();
