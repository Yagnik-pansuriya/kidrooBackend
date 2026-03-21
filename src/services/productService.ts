import Product, { IProduct } from "../models/products";

class ProductService{
  async getAllProducts() {
    const products = await Product.find().populate("category")
    return products
  }

  async getProductById(id:string) {
    const product = await Product.findById(id).populate("category")
    return product
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