namespace enterprise.ai;

using { Attachments } from '@cap-js/attachments';

entity Documents {
  key ID          : UUID;
      fileName    : String(200) not null;
      content     : LargeString;
      uploadedAt  : DateTime;
      fileType    : String(50);
      attachments : Composition of many Attachments;
}

entity Embeddings {
  key ID         : UUID;
      documentID : UUID not null;
      document   : Association to Documents on document.ID = documentID;
      chunkText  : LargeString not null;
      chunkIndex : Integer not null;
      embedding  : LargeString;
}

entity ChatHistory {
  key ID             : UUID;
      conversationID : UUID;
      userQuestion   : LargeString not null;
      aiResponse     : LargeString not null;
      feature        : String(50);
      timestamp      : DateTime;
}