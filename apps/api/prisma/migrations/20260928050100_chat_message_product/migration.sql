ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
