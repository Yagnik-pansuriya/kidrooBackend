import Product, { IProduct } from "../models/products";
import { paginateQuery } from "../utils/common/paginateQuarry";

class ProductService{
  async getAllProducts(query: any = {}) {
    return await paginateQuery({
      model: Product,
      query: query,
      populate: ["category", "variants"]
    });
  }

  async getProductById(id:string) {
    const product = await Product.findById(id).populate("category").populate("variants");
    return product;
  }

  async createProduct(productData:IProduct) {
    const product = await Product.create(productData)
    return product
  }

  async updateProduct(id:string,productData:IProduct) {
    const product = await Product.findByIdAndUpdate(id,productData,{new:true})
    return product
  }

  async deleteProductById(id:string) {
    const product = await Product.findByIdAndDelete(id)
    return product
  }
}

export const productService = new ProductService()